import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const env = {};
for (const file of ["../.env", ".env"]) {
  const url = new URL(file, import.meta.url);
  if (fs.existsSync(url)) for (const line of fs.readFileSync(url, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/); if (match) env[match[1]] = match[2].trim();
  }
}
const base = "https://api.nessieisreal.com";
const key = process.env.NESSIE_API_KEY || env.NESSIE_API_KEY;
if (!key) throw Error("Configura NESSIE_API_KEY en el entorno o en backend/.env");

const run = promisify(execFile);
async function nessie(pathname, options = {}) {
  const separator = pathname.includes("?") ? "&" : "?";
  const args = ["--silent", "--show-error", "--write-out", "\n%{http_code}", "-X", options.method || "GET", "-H", "Content-Type: application/json"];
  if (options.body) args.push("--data", options.body);
  args.push(base + pathname + separator + "key=" + encodeURIComponent(key));
  try {
    const { stdout } = await run(process.platform === "win32" ? "curl.exe" : "curl", ["--max-time", "25", ...args], {maxBuffer: 8 * 1024 * 1024});
    const split=stdout.lastIndexOf("\n"), status=Number(stdout.slice(split+1)), raw=stdout.slice(0,split);
    if(status>=400){let message="Operación rechazada";try{const d=JSON.parse(raw);message=d.message||d.error||JSON.stringify(d);}catch{}const error=Error("Nessie HTTP "+status+": "+String(message).replaceAll(key,"[oculta]").slice(0,500));error.safe=true;throw error;}
    if (!raw.trim()) return {ok:true};
    try { return JSON.parse(raw); } catch { return {ok:true}; }
  } catch (error) { if(error.safe) throw error; throw Error("Nessie no está disponible. Verifica la conexión."); }
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": res.origin || "http://127.0.0.1:4173", "vary":"Origin", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "Content-Type", "cache-control":"no-store" });
  res.end(JSON.stringify(body));
}

http.createServer(async (req, res) => {
  const origins = ["http://127.0.0.1:4173", "http://localhost:4173"];
  if (req.headers.origin && !origins.includes(req.headers.origin)) return send(res,403,{error:"Origen no permitido"});
  res.origin = req.headers.origin;
  if (req.method === "OPTIONS") return send(res, 204, {});
  try {
    const id = value => { if (!/^[a-zA-Z0-9-]{1,80}$/.test(value || "")) throw Error("Identificador inválido"); return value; };
    const body = async () => { let raw=""; for await (const chunk of req) { raw+=chunk; if(raw.length>32768) throw Error("Solicitud demasiado grande"); } return JSON.parse(raw||"{}"); };
    const amount = value => { const n=Number(value); if(!Number.isFinite(n)||n<=0) throw Error("El monto debe ser positivo"); return Math.round(n*100)/100; };
    const payload = (type,b) => {
      const status=b.status || (type==="bill"?"pending":"completed");
      if (!(type==="bill"?["pending","cancelled","completed","recurring"]:["pending","cancelled","completed"]).includes(status)) throw Error("Estado inválido");
      const date=b.date || new Date().toISOString().slice(0,10);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))) throw Error("Fecha inválida");
      if(type==="bill") {
        if(!String(b.payee||"").trim()) throw Error("Escribe el beneficiario");
        return {status,payee:String(b.payee).slice(0,120),nickname:String(b.description||"").slice(0,250),payment_amount:amount(b.amount),payment_date:date,recurring_date:new Date(date+"T12:00:00Z").getUTCDate()};
      }
      return {medium:"balance",status,amount:amount(b.amount),description:String(b.description||"").slice(0,250),[type==="purchase"?"purchase_date":"transaction_date"]:date,...(type==="purchase"?{merchant_id:id(b.merchantId)}:{})};
    };
    const kinds={deposit:"deposits",withdrawal:"withdrawal",purchase:"purchase",bill:"bills"};
    const match=req.url.match(/^\/api\/movements\/(deposit|withdrawal|purchase|bill)\/([a-zA-Z0-9-]+)$/);
    if(match && ["PUT","DELETE"].includes(req.method)) {
      const data=req.method==="PUT"?payload(match[1],await body()):null;
      if(data && match[1]==="purchase") {delete data.merchant_id;delete data.status;}
      return send(res,200,await nessie("/"+kinds[match[1]]+"/"+id(match[2]),{method:req.method,...(data?{body:JSON.stringify(data)}:{})}));
    }
    if(req.method==="DELETE" && /^\/api\/accounts\/[^/]+$/.test(req.url)) return send(res,200,await nessie("/accounts/"+id(req.url.split("/").pop()),{method:"DELETE"}));
    if(req.method==="GET" && req.url==="/api/merchants") return send(res,200,await nessie("/merchants"));
    if(req.method==="POST" && req.url==="/api/merchants") {
      const b=await body();if(!String(b.name||"").trim()) throw Error("Nombre del comercio requerido");
      return send(res,201,await nessie("/merchants",{method:"POST",body:JSON.stringify({name:String(b.name).slice(0,100),category:"Test",address:{street_number:"100",street_name:"Main Street",city:"Austin",state:"TX",zip:"78701"},geocode:{lat:30.2672,lng:-97.7431}})}));
    }
    if (req.method === "GET" && req.url === "/api/customers") return send(res, 200, await nessie("/customers"));
    if (req.method === "POST" && req.url === "/api/customers") {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const { name = "Busynessy", city = "Austin" } = JSON.parse(raw || "{}");
      return send(res, 201, await nessie("/customers", { method: "POST", body: JSON.stringify({ first_name: name, last_name: "Demo", address: { street_number: "100", street_name: "Main Street", city, state: "TX", zip: "78701" } }) }));
    }
    if (req.method === "GET" && req.url.startsWith("/api/accounts/")) {
      const customerId = req.url.split("/").pop();
      return send(res, 200, await nessie("/customers/" + customerId + "/accounts"));
    }
    if (req.method === "GET" && req.url.startsWith("/api/movements/")) {
      const accountId = req.url.split("/").pop();
      const [deposits, withdrawals, purchases, bills] = await Promise.all([
        nessie("/accounts/" + accountId + "/deposits"),
        nessie("/accounts/" + accountId + "/withdrawals"),
        nessie("/accounts/" + accountId + "/purchases"),
        nessie("/accounts/" + accountId + "/bills"),
      ]);
      return send(res, 200, { deposits, withdrawals, purchases, bills });
    }
    if (req.method === "POST" && req.url === "/api/accounts") {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const { customerId, nickname = "Cuenta operativa", balance = 0 } = JSON.parse(raw);
      return send(res, 201, await nessie("/customers/" + customerId + "/accounts", { method: "POST", body: JSON.stringify({ type: "Checking", nickname, rewards: 0, balance: Number(balance) }) }));
    }
    if (req.method === "POST" && req.url === "/api/bootstrap") {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const { name = "Mi empresa" } = JSON.parse(raw || "{}");
      const customer = await nessie("/customers", { method: "POST", body: JSON.stringify({ first_name: name, last_name: "Busynessy", address: { street_number: "100", street_name: "Main Street", city: "Austin", state: "TX", zip: "78701" } }) });
      const account = await nessie("/customers/" + customer.objectCreated._id + "/accounts", { method: "POST", body: JSON.stringify({ type: "Checking", nickname: name + " · Operación", rewards: 0, balance: 0 }) });
      const accountId = account.objectCreated._id;
      const post = (type, amount, description) => nessie("/accounts/" + accountId + "/" + type + "s", { method: "POST", body: JSON.stringify({ medium: "balance", transaction_date: new Date().toISOString().slice(0, 10), status: "completed", amount, description }) });
      await post("deposit", 4000 + Math.floor(Math.random() * 5000), "Ingreso inicial " + name);
      await Promise.all(Array.from({ length: 10 }, (_, i) => post("withdrawal", 120 + Math.floor(Math.random() * 950), "Gasto operativo #" + (i + 1))));
      return send(res, 201, { customer: customer.objectCreated, account: account.objectCreated, created_movements: 11 });
    }
    if (req.method === "POST" && req.url === "/api/movements") {
      let raw = ""; for await (const chunk of req) raw += chunk;
      const b=JSON.parse(raw), {accountId,type}=b;
      if (!Object.hasOwn(kinds,type)) return send(res,400,{error:"Tipo no permitido"});
      return send(res,201,await nessie("/accounts/"+id(accountId)+"/"+type+"s",{method:"POST",body:JSON.stringify(payload(type,b))}));
    }
    send(res, 404, { error: "Ruta no encontrada." });
  } catch (error) { send(res, 502, { error: error.message }); }
}).listen(Number(process.env.PORT || 8787), "127.0.0.1", () => console.log("Busynessy backend listo en loopback"));

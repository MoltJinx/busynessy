import { useState } from 'react'; 
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

    const handleSubmit = (e) => {
    e.preventDefault(); // Evita que la página se recargue
    console.log('Enviando datos:', { email, password });
    
    alert(`Iniciando sesión con: ${email}`);
  };
  return (
    <div class="login-card">
      <h1 class="titulo-login">Busynessy B2B</h1>

      <h2 class="subtitulo-login">Iniciar sesión</h2>

      <form onSubmit={handleSubmit}>
        <div id="cuentabancariaform">
          <label >Cuentas bancaria:</label>
          <input
            type="email"
            id="email"
            name="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div id="passwordform">
          <label htmlFor="password">Contraseña:</label>
          <input
            type="password"
            id="password"
            name="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit" class="btn btn-primary">
          Iniciar sesión
        </button>
      </form>
    </div>
  );
}

export default Login;
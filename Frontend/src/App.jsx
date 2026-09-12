import './App.css'
import Dashboard from './components/DashBoard.jsx'
import { initialCompanies, initialMovements } from './components/data.js'

function App() {
  // Vista de prueba: el dashboard recibe datos locales, no una sesión bancaria.
  return <Dashboard company={initialCompanies[0]} movements={initialMovements} />
}

export default App
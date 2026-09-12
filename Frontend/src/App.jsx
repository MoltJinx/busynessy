import './App.css'
import Dashboard from './components/DashBoard.jsx'
import Login from './components/Login.jsx'
import './components/Login.css'
import { initialCompanies, initialMovements } from './components/data.js'

function App() {
  // Vista de prueba: el dashboard recibe datos locales, no una sesión bancaria.
  return <Login  />
}

export default App
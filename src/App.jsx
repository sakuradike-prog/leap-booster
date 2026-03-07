import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import Challenge from './pages/Challenge'
import Warmup from './pages/Warmup'
import Stats from './pages/Stats'
import Settings from './pages/Settings'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/challenge" element={<Challenge />} />
        <Route path="/warmup" element={<Warmup />} />
        <Route path="/stats" element={<Stats />} />
        <Route path="/settings" element={<Settings />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App

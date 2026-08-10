import { createRoot } from 'react-dom/client'
import '@genoffice/ui/tokens.css'
import { App } from './App'
import './styles.css'

const root = createRoot(document.getElementById('root')!)
root.render(<App />)

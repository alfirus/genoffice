import { createRoot } from 'react-dom/client'
import '@genoffice/ui/tokens.css'
import { App } from './App'
import '@genoffice/ui/screentip.css'
import './styles.css'
import { installScreenTips } from '@genoffice/ui'

installScreenTips()

const root = createRoot(document.getElementById('root')!)
root.render(<App />)

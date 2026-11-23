import { createApp } from 'vue'
import { createPinia } from 'pinia'
import VNetworkGraph from 'v-network-graph'
import 'v-network-graph/lib/style.css'
import FleetEntry from './FleetEntry.vue'
import router from './router'
// Шрифт логотипа — локально, без интернета тоже работает.
import '@fontsource/michroma/latin-400.css'
import './assets/main.css'

const app = createApp(FleetEntry)
app.use(createPinia())
app.use(router)
app.use(VNetworkGraph)
app.mount('#app')

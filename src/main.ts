import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'
import { createApp } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import App from './App.vue'
import './styles.scss'

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'keenyDark',
    themes: {
      keenyDark: {
        dark: true,
        colors: {
          background: '#0b0e11',
          surface: '#12171b',
          primary: '#5edca8',
          secondary: '#8fa8ff',
          error: '#ff7d86',
          warning: '#ffc76b',
          info: '#70c8ff',
          success: '#5edca8',
        },
      },
      keenyLight: {
        dark: false,
        colors: {
          background: '#f3f5f6',
          surface: '#ffffff',
          primary: '#12845f',
          secondary: '#4f65bd',
          error: '#c7434f',
          warning: '#a86b0a',
          info: '#176c9b',
          success: '#12845f',
        },
      },
    },
  },
})

createApp(App).use(vuetify).mount('#app')

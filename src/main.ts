import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

// Handler centralizzato per errori di lazy chunk mancanti / corrotti
function handleChunkLoadErrorAndReload() {
  try {
    // Prova ad aggiornare il Service Worker e ripulire le cache ngsw
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => regs.forEach(r => r.update()));
    }
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(k => {
          if (/^ngsw:/.test(k)) {
            caches.delete(k);
          }
        });
      });
    }
  } catch {
    // ignora eventuali errori durante la pulizia
  } finally {
    // ricarica la pagina per riallineare index.html e chunk
    location.reload();
  }
}

if (typeof window !== 'undefined') {
  // Cattura promesse rifiutate non gestite (es. import() dei chunk)
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const msg = String(event.reason?.message ?? event.reason ?? '');
    if (
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk') ||
      msg.includes('import()') ||
      msg.includes('Failed to fetch dynamically imported module')
    ) {
      handleChunkLoadErrorAndReload();
    }
  });

  // Cattura errori JS globali legati al caricamento dei chunk
  window.addEventListener('error', (e: ErrorEvent) => {
    const msg = String(e.error?.message ?? e.message ?? '');
    if (msg.includes('ChunkLoadError') || msg.includes('Loading chunk')) {
      handleChunkLoadErrorAndReload();
    }
  });
}

platformBrowserDynamic()
  .bootstrapModule(AppModule)
  .catch(err => console.error(err));

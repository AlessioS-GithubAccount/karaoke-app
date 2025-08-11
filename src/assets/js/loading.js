window.addEventListener('load', function() {
  console.log('Pagina completamente caricata, nascondo loader');
  const loader = document.getElementById('app-loading');
  if (loader) {
    loader.style.display = 'none';
  } else {
    console.log('Loader non trovato!');
  }
});



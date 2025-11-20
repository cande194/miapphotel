document.addEventListener('DOMContentLoaded', async () => {
  try {
    const response = await fetch('http://localhost:4000/api/tipos-habitacion');

    if (!response.ok) {
      throw new Error('Respuesta no OK de la API');
    }

    const tipos = await response.json();
    console.log('Tipos habitación desde API:', tipos);

    tipos.forEach(tipo => {
      const card = document.querySelector(
        `[data-tipo-habitacion="${tipo.nombre}"]`
      );
      if (!card) return;

      const spanPrecio = card.querySelector('.precio-habitacion');
      if (!spanPrecio) return;

      const precio = Number(tipo.precio_base);
      spanPrecio.textContent = `ARS ${precio.toLocaleString('es-AR')}`;
    });
  } catch (error) {
    console.error('Error cargando precios de habitaciones:', error);
  }
});

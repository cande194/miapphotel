async function crearReserva() {
  try {
    const body = {
      usuario_id: parseInt(document.querySelector("#usuario_id").value),
      habitacion_id: parseInt(document.querySelector("#habitacion_id").value),
      checkin: document.querySelector("#checkin").value,
      checkout: document.querySelector("#checkout").value,
      total: parseFloat(document.querySelector("#total").value)
    };

    const r = await fetch("/api/operador/reservas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await r.json();

    if (!r.ok) {
      alert("❌ Error: " + data.error);
      return;
    }

    alert("✔ Reserva creada correctamente");

    // Recargar tabla
    cargarReservas();

  } catch (err) {
    console.error(err);
    alert("Hubo un error al crear la reserva");
  }
}

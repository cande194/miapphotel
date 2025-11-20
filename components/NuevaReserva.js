import React, { useState } from 'react';
import axios from 'axios';

const NuevaReserva = () => {
  const [form, setForm] = useState({
    habitacion_id: '',
    nombre: '',
    email: '',
    telefono: '',
    fecha_desde: '',
    fecha_hasta: '',
    cant_personas: 1,
    obs: ''
  });

  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMensaje('');
    setError('');

    try {
      const url = `${process.env.REACT_APP_API_URL}/reservas`; // ej: http://localhost:4000/api/reservas
      const resp = await axios.post(url, form);
      setMensaje(`Reserva creada correctamente. Nro: ${resp.data.reserva.id}`);
      // Si querés limpiar el formulario:
      // setForm({ habitacion_id:'', nombre:'', email:'', telefono:'', fecha_desde:'', fecha_hasta:'', cant_personas:1, obs:'' });
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.msg || 'Error al crear la reserva');
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '0 auto' }}>
      <h2>Nueva reserva</h2>

      <form onSubmit={handleSubmit}>
        <div>
          <label>ID Habitación</label>
          <input
            type="number"
            name="habitacion_id"
            value={form.habitacion_id}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Nombre completo</label>
          <input
            type="text"
            name="nombre"
            value={form.nombre}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Email</label>
          <input
            type="email"
            name="email"
            value={form.email}
            onChange={handleChange}
          />
        </div>

        <div>
          <label>Teléfono</label>
          <input
            type="text"
            name="telefono"
            value={form.telefono}
            onChange={handleChange}
          />
        </div>

        <div>
          <label>Fecha desde</label>
          <input
            type="date"
            name="fecha_desde"
            value={form.fecha_desde}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Fecha hasta</label>
          <input
            type="date"
            name="fecha_hasta"
            value={form.fecha_hasta}
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Cantidad de personas</label>
          <input
            type="number"
            name="cant_personas"
            value={form.cant_personas}
            min="1"
            onChange={handleChange}
            required
          />
        </div>

        <div>
          <label>Observaciones</label>
          <textarea
            name="obs"
            value={form.obs}
            onChange={handleChange}
          />
        </div>

        <button type="submit">Reservar</button>
      </form>

      {mensaje && <p style={{ color: 'green' }}>{mensaje}</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}
    </div>
  );
};

export default NuevaReserva;

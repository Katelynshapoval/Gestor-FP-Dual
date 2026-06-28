import InfoField from "./InfoField.jsx";

// Extrae especialidades del nuevo formato normalizado de la API.
const getSelectedSpecialities = (companyData) => {
  if (!companyData) return [];
  // Formato nuevo: array de objetos con {id_especialidad, nombre, cantidad_alumnos}
  if (Array.isArray(companyData.especialidades)) {
    return companyData.especialidades.map((e) => ({
      nombre: e.nombre || e.especialidad || `ID ${e.id_especialidad}`,
      cantidad: e.cantidad_alumnos ?? e.cantidadAlumnos ?? 0,
    }));
  }
  return [];
};

// Extrae métodos de transporte del nuevo formato normalizado de la API.
const getSelectedTransports = (companyData) => {
  if (!companyData) return [];
  if (Array.isArray(companyData.transportes)) {
    return companyData.transportes.map((t) => t.nombre || t.transporte || "—");
  }
  return [];
};

// Todas las secciones de datos de la empresa.
const CompanyInfo = ({ companyData }) => {
  if (!companyData) {
    return (
      <p className="text-center text-gray-500 py-8">
        No se encontraron datos de solicitud asociados a tu cuenta.
      </p>
    );
  }

  const selectedSpecialities = getSelectedSpecialities(companyData);
  const selectedTransports = getSelectedTransports(companyData);

  return (
    <div className="space-y-6">
      {/* Coordinador */}
      <div>
        <p className="section-label">Datos del coordinador</p>
        <p className="text-sm text-gray-500 mb-4 ml-5">
          <strong className="text-brand-500">Importante:</strong> Esta persona
          recibe todas las notificaciones y documentos del proyecto DUAL.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <InfoField
            label="Email coordinador"
            value={companyData.emailCoordinador || companyData.coordinador_email}
          />
          <InfoField
            label="Nombre coordinador"
            value={companyData.nombreCoordinador || companyData.coordinador_nombre}
          />
          <InfoField
            label="Teléfono coordinador"
            value={companyData.telefonoCoordinador || companyData.coordinador_telefono}
          />
        </div>
      </div>

      {/* Empresa */}
      <div>
        <p className="section-label">Datos de la empresa</p>
        <div className="grid gap-4 md:grid-cols-2">
          <InfoField label="Razón Social" value={companyData.razonSocial || companyData.empresa} />
          <InfoField label="CIF" value={companyData.cif} />
          <InfoField label="Teléfono empresa" value={companyData.telEmpresa || companyData.telefono} />
          <InfoField
            label="Dirección Razón Social"
            value={companyData.dirRazSocial || companyData.domicilio_legal}
          />
          <InfoField label="Municipio" value={companyData.municipio || companyData.localidad_legal} />
          <InfoField label="Provincia" value={companyData.provincia || companyData.provincia_legal} />
          <InfoField label="Código Postal" value={companyData.cpRazSoc || companyData.cp_legal} />
        </div>
      </div>

      {/* Responsable Legal */}
      <div>
        <p className="section-label">Responsable Legal</p>
        <div className="grid gap-4 md:grid-cols-3">
          <InfoField
            label="Nombre responsable legal"
            value={companyData.responsableLegal || companyData.representante_nombre}
          />
          <InfoField
            label="DNI responsable"
            value={companyData.dniRl || companyData.representante_dni}
          />
          <InfoField
            label="Cargo"
            value={companyData.cargo || companyData.representante_cargo}
          />
        </div>
      </div>

      {/* Puesto de trabajo */}
      <div>
        <p className="section-label">Puesto de trabajo</p>
        <div className="space-y-4">
          <div className="field">
            <label>Descripción del puesto</label>
            <p className="input bg-gray-50 cursor-default min-h-[60px] whitespace-pre-wrap">
              {companyData.descripcionPuesto || companyData.descripcion_puesto || "—"}
            </p>
          </div>
          <InfoField
            label="Dirección del lugar de trabajo"
            value={companyData.direccionLugarTrabajo || companyData.domicilio_trabajo}
          />
        </div>
      </div>

      {/* Ciclos solicitados */}
      <div>
        <p className="section-label">Ciclo(s) de Grado solicitados</p>
        {selectedSpecialities.length > 0 ? (
          <div className="space-y-2">
            {selectedSpecialities.map((spec, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-2 border"
              >
                <span className="text-sm font-medium">{spec.nombre}</span>
                <span className="text-sm text-gray-500">
                  {spec.cantidad} alumno{spec.cantidad !== 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            No se encontraron especialidades.
          </p>
        )}
      </div>

      {/* Transportes */}
      <div>
        <p className="section-label">Métodos de Transporte posibles</p>
        <p className="text-sm text-gray-500 mb-4 ml-5">
          Medios de transporte con los que el alumno puede acceder al puesto.
        </p>
        {selectedTransports.length > 0 ? (
          <div className="checkbox-grid">
            {selectedTransports.map((name, i) => (
              <div key={i} className="checkbox-item checked">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked
                    readOnly
                    className="accent-brand-500"
                  />
                  <span className="item-label">{name}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">
            No se indicaron métodos de transporte.
          </p>
        )}
      </div>
    </div>
  );
};

export default CompanyInfo;

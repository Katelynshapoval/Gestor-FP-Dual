import InfoField from "./InfoField.jsx";

// Parsear las especialidades seleccionadas desde el JSON almacenado.
const getSelectedSpecialities = (companyData, specialities) => {
  if (!companyData?.especialidadYCantAlumnos) return [];
  try {
    const parsed = JSON.parse(companyData.especialidadYCantAlumnos);
    const ids = parsed[0] || [];
    const amounts = parsed[1] || [];
    return ids.map((id, i) => {
      const spec = specialities.find((s) => s.idEspecialidad === id);
      return {
        nombre: spec?.nombreEsp || `Especialidad ${id}`,
        cantidad: amounts[i] || 0,
      };
    });
  } catch {
    return [];
  }
};

// Parsear los IDs de transporte y resolverlos a nombres.
const getSelectedTransports = (companyData, transports) => {
  if (!companyData?.metodosTransporte) return [];
  try {
    let ids;
    const raw = companyData.metodosTransporte;
    if (typeof raw === "string") {
      try {
        ids = JSON.parse(raw);
      } catch {
        ids = raw.split(",").map((s) => Number(s.trim()));
      }
    } else if (Array.isArray(raw)) {
      ids = raw;
    } else {
      ids = [Number(raw)];
    }
    if (!Array.isArray(ids)) ids = [ids];

    return ids
      .map((id) => {
        const t = transports.find((t) => t.idTransporte === Number(id));
        return t?.transporte || null;
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

// Todas las secciones de datos de la empresa.
const CompanyInfo = ({ companyData, specialities, transports }) => {
  if (!companyData) {
    return (
      <p className="text-center text-gray-500 py-8">
        No se encontraron datos de solicitud asociados a tu cuenta.
      </p>
    );
  }

  const selectedSpecialities = getSelectedSpecialities(
    companyData,
    specialities,
  );
  const selectedTransports = getSelectedTransports(companyData, transports);

  return (
    <div className="space-y-6">
      {/* ── Coordinador ── */}
      <div>
        <p className="section-label">Datos del coordinador</p>
        <p className="text-sm text-gray-500 mb-4 ml-5">
          <strong className="text-brand-500">Importante:</strong> Esta persona
          recibe todas las notificaciones y documentos del proyecto DUAL.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <InfoField
            label="Email coordinador"
            value={companyData.emailCoordinador}
          />
          <InfoField
            label="Nombre coordinador"
            value={companyData.nombreCoordinador}
          />
          <InfoField
            label="Teléfono coordinador"
            value={companyData.telefonoCoordinador}
          />
        </div>
      </div>

      {/* ── Empresa ── */}
      <div>
        <p className="section-label">Datos de la empresa</p>
        <div className="grid gap-4 md:grid-cols-2">
          <InfoField label="Razón Social" value={companyData.razonSocial} />
          <InfoField label="CIF" value={companyData.cif} />
          <InfoField label="Teléfono empresa" value={companyData.telEmpresa} />
          <InfoField
            label="Dirección Razón Social"
            value={companyData.dirRazSocial}
          />
          <InfoField label="Municipio" value={companyData.municipio} />
          <InfoField label="Provincia" value={companyData.provincia} />
          <InfoField label="Código Postal" value={companyData.cpRazSoc} />
        </div>
      </div>

      {/* ── Responsable Legal ── */}
      <div>
        <p className="section-label">Responsable Legal</p>
        <div className="grid gap-4 md:grid-cols-3">
          <InfoField
            label="Nombre responsable legal"
            value={companyData.responsableLegal}
          />
          <InfoField label="DNI responsable" value={companyData.dniRl} />
          <InfoField label="Cargo" value={companyData.cargo} />
        </div>
      </div>

      {/* ── Puesto de trabajo ── */}
      <div>
        <p className="section-label">Puesto de trabajo</p>
        <div className="space-y-4">
          <div className="field">
            <label>Descripción del puesto</label>
            <p className="input bg-gray-50 cursor-default min-h-[60px] whitespace-pre-wrap">
              {companyData.descripcionPuesto || "—"}
            </p>
          </div>
          <InfoField
            label="Dirección del lugar de trabajo"
            value={companyData.direccionLugarTrabajo}
          />
        </div>
      </div>

      {/* ── Ciclos solicitados ── */}
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

      {/* ── Transportes ── */}
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

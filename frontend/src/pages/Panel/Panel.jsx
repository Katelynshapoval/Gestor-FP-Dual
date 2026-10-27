import { Link } from "react-router-dom";
import PageHeader from "../../components/ui/PageHeader";
import { navForUser } from "../../navigation.js";
import { useUser } from "../../context/UserContext";

// Staff landing page. Interim version: links to each management area. The
// pending-work counters (GET /panel/resumen) are the next Phase 4 step.
const Panel = () => {
  const { user } = useUser();
  const areas = navForUser(user).filter((item) => item.to !== "/panel");
  return (
    <div className="page-container">
      <PageHeader kicker="Administración" title="Panel" subtitle="Accede a cada área de gestión." />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {areas.map(({ to, label, Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="flex items-center gap-3 rounded-xl2 border border-surface-200 bg-white p-5 shadow-card outline-none transition-[border-color,box-shadow] duration-150 hover:border-brand-200 hover:shadow-card-hover focus-visible:ring-2 focus-visible:ring-brand-500/30"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-brand-700">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="font-semibold text-charcoal-950">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Panel;


import {
  Flame,
  Map,
  BarChart3,
  CalendarDays,
  Layers,
  SlidersHorizontal,
  Upload,
} from "lucide-react";

const navigation = [
  { id: "map", icon: Map, title: "Map" },
  { id: "statistics", icon: BarChart3, title: "Statistics" },
  { id: "historical", icon: CalendarDays, title: "Historical activity" },
  { id: "sensors", icon: Layers, title: "Sensor comparison" },
  { id: "filters", icon: SlidersHorizontal, title: "Filters" },
  { id: "import", icon: Upload, title: "Import data" },
];

export default function Sidebar({
  activeSection = "map",
  onSectionChange,
}) {
  return (
    <nav className="firelens-sidebar">
      <div className="sidebar-logo">
        <Flame size={26} />
      </div>

      <div className="sidebar-navigation">
        {navigation.map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            type="button"
            title={title}
            aria-label={title}
            className={
              activeSection === id ? "active" : ""
            }
            onClick={() => onSectionChange?.(id)}
          >
            <Icon size={21} />
          </button>
        ))}
      </div>
    </nav>
  );
}

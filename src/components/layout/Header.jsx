
import { Flame, Globe2, Satellite } from "lucide-react";

export default function Header() {
  return (
    <header className="top-header">
      <div className="brand">
        <div className="brand-icon">
          <Flame size={24} />
        </div>
        <div>
          <h1>FireLens</h1>
          <p>EARTH FIRE INTELLIGENCE</p>
        </div>
      </div>

      <nav className="top-nav">
        <span className="nav-active"><Globe2 size={16}/> Explore</span>
        <span><Satellite size={16}/> Sensor Lab</span>
        <span>Time Machine</span>
        <span>Region DNA</span>
      </nav>

      <div className="header-status">
        NASA SPACE APPS 2026
      </div>
    </header>
  );
}

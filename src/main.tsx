import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, NavLink } from "react-router";
import Home from "./pages/Home";
import Clock from "./pages/Clock";
import Wheel from "./pages/Wheel";
import styles from "./App.module.scss";
import "./index.css";

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${styles.link} ${styles.active}` : styles.link;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <div className={styles.shell}>
        <nav className={styles.nav}>
          <NavLink to="/" className={navClass} end>
            home
          </NavLink>
          <NavLink to="/clock" className={navClass}>
            clock
          </NavLink>
          <NavLink to="/wheel" className={navClass}>
            wheel
          </NavLink>
        </nav>
        <main className={styles.main}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/clock" element={<Clock />} />
            <Route path="/wheel" element={<Wheel />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  </StrictMode>,
);
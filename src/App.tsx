import type { ReactNode } from 'react';
import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { PublicBookingRequest } from './pages/PublicBookingRequest';
import { PublicBookingPayment } from './pages/PublicBookingPayment';
import { PublicPayment } from './pages/PublicPayment';
import './App.css';

function Header() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <header className="site-header">
      <Link to="/" className="brand">FOLYO</Link>
      <nav className="header-nav">
        {loading ? null : user ? (
          <>
            <span className="header-name">{user.name}</span>
            <button type="button" onClick={handleLogout}>Log out</button>
          </>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
          </>
        )}
      </nav>
    </header>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppShell() {
  const location = useLocation();
  const isPublicBookingPage = location.pathname.startsWith('/book/') || location.pathname.startsWith('/pay/');

  return (
    <div className="app-shell">
      {!isPublicBookingPage && <Header />}
      <main>
        <Routes>
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/book/:slug" element={<PublicBookingRequest />} />
          <Route path="/pay/:slug/:bookingId" element={<PublicBookingPayment />} />
          <Route path="/pay/:slug" element={<PublicPayment />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;

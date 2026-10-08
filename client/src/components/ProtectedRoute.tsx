import { Navigate, Outlet, useLocation } from "react-router";
import { useAppSelector } from "../hooks";
function ProtectedRoute() {
  const { user, status } = useAppSelector((state) => state.auth);
  const location = useLocation();
  if (status === "loading") return null;
  if (!user) return <Navigate replace state={{ from: location }} to="/login" />;
  return <Outlet />;
}
export default ProtectedRoute;

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { DashboardPage } from './pages/DashboardPage'
import { LoginPage } from './pages/LoginPage'
import { MedicationsPage } from './pages/MedicationsPage'
import { ProviderPatientDetailPage } from './pages/ProviderPatientDetailPage'
import { ProviderPatientsPage } from './pages/ProviderPatientsPage'
import { RegisterPage } from './pages/RegisterPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/medications" element={<MedicationsPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/provider/patients" element={<ProviderPatientsPage />} />
            <Route path="/provider/patients/:patientId" element={<ProviderPatientDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

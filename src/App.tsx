import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider } from '@/context/AppContext';
import { MobileLayout } from '@/components/MobileLayout';
import { MessagesPage } from '@/pages/MessagesPage';
import { TimetablePage } from '@/pages/TimetablePage';
import { GradesPage } from '@/pages/GradesPage';
import { SettingsAuthPage } from '@/pages/SettingsAuthPage';

/**
 * OpenEdu root application component.
 *
 * Uses `HashRouter` for full compatibility with Capacitor Android/iOS WebView
 * file-based routing.
 */
export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<MobileLayout />}>
            <Route index element={<Navigate to="/messages" replace />} />
            <Route path="/messages" element={<MessagesPage />} />
            <Route path="/messages/:messageId" element={<MessagesPage />} />
            <Route path="/timetable" element={<TimetablePage />} />
            <Route path="/grades" element={<GradesPage />} />
            <Route path="/settings" element={<SettingsAuthPage />} />
            <Route path="*" element={<Navigate to="/messages" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  );
}

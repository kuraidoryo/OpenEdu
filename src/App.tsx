import { GraduationCap } from 'lucide-react';

/**
 * Temporary placeholder shell (Phase 1).
 * Routing, layout and pages are wired up in later phases.
 */
export default function App() {
  return (
    <main className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-2xl bg-brand-600 p-4 text-white shadow-lg">
        <GraduationCap size={40} />
      </div>
      <h1 className="text-2xl font-bold">OpenEdu</h1>
      <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
        Nieoficjalny, darmowy klient dziennika eduVULCAN. Projekt w budowie.
      </p>
    </main>
  );
}

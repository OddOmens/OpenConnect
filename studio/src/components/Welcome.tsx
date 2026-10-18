import { NewAppForm } from './AppRail';

export function Welcome({ hasApps, onCreate, loading }: { hasApps: boolean; onCreate: (name: string, preset: string) => void; loading: boolean }) {
  if (loading || hasApps) return <main className="workspace" />;
  return (
    <main className="workspace welcome">
      <div className="welcome-card">
        <h1>Start with an app</h1>
        <p>
          Name it and pick a starting style. Then drop in screenshots, or ask Claude to capture them from the simulator
          and send them here.
        </p>
        <NewAppForm onCreate={onCreate} />
        <pre className="cli-hint">npx appshot create "My App" --preset forest</pre>
      </div>
    </main>
  );
}

export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-soft">
      <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
      <p className="mt-3 max-w-2xl text-slate-600">{description}</p>
    </div>
  )
}

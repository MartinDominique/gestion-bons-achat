{/* === Historique des soumissions === */}
<h2 className="text-xl font-bold mt-10 mb-3">Soumissions enregistrées</h2>

<table className="w-full text-sm border">
  <thead className="bg-gray-100">
    <tr>
      <th className="px-2 py-1 text-left">Date</th>
      <th className="px-2 py-1 text-left">Client</th>
      <th className="px-2 py-1 text-right">Total ($)</th>
      <th className="px-2 py-1"></th>
    </tr>
  </thead>
  <tbody>
    {quotes.map((q) => (
      <tr key={q.id} className="border-t hover:bg-gray-50">
        <td className="px-2 py-1">
          {new Date(q.created_at).toLocaleDateString()}
        </td>
        <td className="px-2 py-1">{q.client?.name}</td>
        <td className="px-2 py-1 text-right">
          {q.total.toFixed(2)}
        </td>
        <td className="px-2 py-1 text-right">
          <a
            href={`/api/quote-pdf?id=${q.id}`}
            className="text-blue-600 hover:underline"
            target="_blank"
          >
            📄 PDF
          </a>
        </td>
      </tr>
    ))}

    {quotes.length === 0 && (
      <tr>
        <td colSpan={4} className="px-2 py-4 text-center text-gray-500">
          Aucune soumission trouvée.
        </td>
      </tr>
    )}
  </tbody>
</table>

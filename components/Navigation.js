'use client'
-import { useState } from 'react';
+import Link from 'next/link';
…
- {pages.map((page) => {
-   const Icon = page.icon;
-   const isActive = currentPage === page.id;
-   return (
-     <button
-       key={page.id}
-       onClick={() => onPageChange(page.id)}
-       className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
-         isActive
-           ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
-           : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
-       }`}
-     >
-       <Icon className="w-5 h-5 mr-2" />
-       {page.name}
-     </button>
-   );
- })}
+ {pages.map((page) => {
+   const Icon = page.icon;
+   return (
+     <Link
+       key={page.id}
+       href={`/${page.id}`}   // => /bons-achat ou /soumissions
+       className={`flex items-center px-4 py-2 rounded-lg font-medium transition-colors ${
+         // souligne si l’URL actuelle commence par /{page.id}
+         typeof window !== 'undefined' && window.location.pathname.startsWith('/' + page.id)
+           ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
+           : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
+       }`}
+     >
+       <Icon className="w-5 h-5 mr-2" />
+       {page.name}
+     </Link>
+   );
+ })}

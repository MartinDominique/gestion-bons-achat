// components/PurchaseOrder/utils/formatting.js
export const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD'
  }).format(amount || 0);
};

export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  return new Date(dateString).toLocaleDateString('fr-CA');
};

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const getFileIcon = (fileType) => {
  if (fileType?.includes('pdf')) return '📄';
  if (fileType?.includes('excel') || fileType?.includes('sheet')) return '📊';
  if (fileType?.includes('word') || fileType?.includes('document')) return '📝';
  if (fileType?.includes('image')) return '🖼️';
  return '📎';
};

export const getStatusEmoji = (status) => {
  switch (status?.toLowerCase()) {
    case 'approved': return '✅';
    case 'pending': return '⏳';
    case 'rejected': return '❌';
    case 'partially_delivered': return '📦';
    default: return '⏳';
  }
};

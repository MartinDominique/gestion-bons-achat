
import { supabase } from '../../../lib/supabase';
import { formatDate, formatCurrency } from './formatting';

export const generateDeliveryNumber = async () => {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const prefix = `BL-${year}${month}`;
  
  const { data } = await supabase
    .from('delivery_slips')
    .select('delivery_number')
    .like('delivery_number', `${prefix}%`)
    .order('delivery_number', { ascending: false })
    .limit(1);
  
  if (!data || data.length === 0) {
    return `${prefix}-001`;
  }
  
  const lastNum = parseInt(data[0].delivery_number.split('-')[2]) || 0;
  return `${prefix}-${String(lastNum + 1).padStart(3, '0')}`;
};

export const generatePDF = async (deliverySlip, selectedItems, formData, clientPO) => {
  // Insérez ici toute la fonction generatePDF de DeliverySlipModal.js
  // C'est la longue fonction qui génère le HTML et ouvre la fenêtre d'impression
};

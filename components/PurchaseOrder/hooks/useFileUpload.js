// ========================================
// FICHIER 3: hooks/useFileUpload.js
// ========================================
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const useFileUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState('');

  const ACCEPTED_FILE_TYPES = {
    documents: ['.pdf', '.doc', '.docx', '.txt'],
    images: ['.jpg', '.jpeg', '.png', '.gif', '.bmp'],
    spreadsheets: ['.xlsx', '.xls', '.csv'],
    all: ['.pdf', '.doc', '.docx', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.xlsx', '.xls', '.csv']
  };

  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

  // Valider un fichier
  const validateFile = useCallback((file, allowedTypes = 'all') => {
    const errors = [];
    
    if (!file) {
      errors.push('Aucun fichier sélectionné');
      return { isValid: false, errors };
    }

    // Vérifier la taille
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`Le fichier est trop volumineux (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`);
    }

    // Vérifier le type
    const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
    const allowedExtensions = ACCEPTED_FILE_TYPES[allowedTypes] || ACCEPTED_FILE_TYPES.all;
    
    if (!allowedExtensions.includes(fileExtension)) {
      errors.push(`Type de fichier non supporté. Types acceptés: ${allowedExtensions.join(', ')}`);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }, []);

  // Upload d'un fichier vers Supabase Storage
  const uploadFile = useCallback(async (file, bucket = 'documents', folder = '') => {
    try {
      setIsUploading(true);
      setError('');
      setUploadProgress(0);

      // Valider le fichier
      const validation = validateFile(file);
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }

      // Générer un nom de fichier unique
      const timestamp = new Date().getTime();
      const randomString = Math.random().toString(36).substring(2, 8);
      const fileExtension = file.name.split('.').pop();
      const fileName = `${timestamp}_${randomString}.${fileExtension}`;
      const filePath = folder ? `${folder}/${fileName}` : fileName;

      console.log(`📤 Upload fichier: ${file.name} -> ${filePath}`);

      // Upload vers Supabase
      const { data, error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      setUploadProgress(100);

      if (uploadError) {
        throw new Error(`Erreur upload: ${uploadError.message}`);
      }

      // Obtenir l'URL publique
      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

      console.log(`✅ Fichier uploadé avec succès: ${publicUrl}`);

      return {
        success: true,
        data: {
          path: filePath,
          publicUrl,
          originalName: file.name,
          size: file.size,
          type: file.type,
          bucket
        }
      };

    } catch (err) {
      console.error('❌ Erreur upload fichier:', err);
      setError(err.message);
      return {
        success: false,
        error: err.message
      };
    } finally {
      setIsUploading(false);
    }
  }, [validateFile]);

  return {
    isUploading,
    uploadProgress,
    error,
    ACCEPTED_FILE_TYPES,
    MAX_FILE_SIZE,
    validateFile,
    uploadFile
  };
};

export default useFileUpload;

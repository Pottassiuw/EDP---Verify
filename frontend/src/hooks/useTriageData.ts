import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchData, upload, toggleComplete, markDuplicate } from '../api';

export function useTriageData() {
  return useQuery({
    queryKey: ['triage'],
    queryFn: fetchData,
    retry: false,
    staleTime: 30_000,
  });
}

export function useUpload() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triage'] }),
  });
}

export function useToggleComplete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleComplete,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triage'] }),
  });
}

export function useMarkDuplicate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: markDuplicate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triage'] }),
  });
}

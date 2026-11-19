import { translate } from '@/lib/i18n';
import { usePremium } from '@/store/premium';
import { useToast } from '@/store/toast';
import { useUi } from '@/store/ui';
import { MAX_FILES, maxUploadMb, useUploads } from '@/store/uploads';

/** Filters out oversized files (with a toast, hinting at Premium when it would allow them) and opens the preview dialog. */
export function stageFiles(files: File[], t: (k: 'attach.tooBig' | 'attach.tooMany') => string) {
  const limit = maxUploadMb();
  const ok = files.filter((f) => f.size > 0 && f.size <= limit * 1024 * 1024);
  if (ok.length < files.length) {
    const info = usePremium.getState().info;
    const hint = info && !info.active && info.uploadMb.premium > limit ? ` · ${translate(useUi.getState().lang, 'pm.more').replace('{n}', String(info.uploadMb.premium))}` : '';
    useToast.getState().show(`${t('attach.tooBig')} (max ${limit} MB)${hint}`, 'error');
  }
  if (ok.length > MAX_FILES) useToast.getState().show(t('attach.tooMany'), 'error');
  if (ok.length) useUploads.getState().stage(ok);
}

/** Canvas UI only. Never apply to drawing text or editable values. */
import { currentLanguage, translate } from '../../site/i18n-core.mjs';
export const uiText = (text: string): string => translate(text,currentLanguage(typeof location === 'undefined' ? '/' : location.href));

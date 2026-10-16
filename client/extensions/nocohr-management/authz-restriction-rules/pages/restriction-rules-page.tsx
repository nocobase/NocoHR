import type { ReactElement } from 'react';
import { PermissionsPage } from '../../authorization/management.js';
import { useAuthorizationTranslation } from '../i18n.js';
import { RestrictionRulesPanel } from './restriction-rules-panel.js';
import {
  AuthorizationPageState,
  useAuthorizationPageData,
} from '../../authorization/management.js';

export default function RestrictionRulesPage(): ReactElement {
  const t = useAuthorizationTranslation();
  const page = useAuthorizationPageData('restrictionRules');
  return (
    <PermissionsPage
      title={t('restrictionRules.page.title')}
      description={t('restrictionRules.page.description')}
    >
      {page.options ? (
        <RestrictionRulesPanel options={page.options} />
      ) : (
        <AuthorizationPageState {...page} />
      )}
    </PermissionsPage>
  );
}

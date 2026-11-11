/** Schedule (or Setlists in your own space). Services, song orders, Rehearse and Perform come with milestone 4. */
import { CalendarIcon } from '@/components/icons';
import { Body, Card, Page, TopBar } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors } from '@/theme/tokens';

export default function Schedule() {
  const { group } = useSession();
  const personal = !group || group.type === 'personal';
  return (
    <Page>
      <TopBar title={personal ? 'Setlists' : 'Schedule'} subtitle={personal ? 'Your own song orders for weddings, concerts and services.' : group?.name} />
      <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
        <CalendarIcon size={36} color={colors.muted} />
        <Body style={{ textAlign: 'center', fontSize: 16 }}>
          {personal ? 'Setlists are coming next.' : 'Services, rehearsals and song orders are coming next.'}
        </Body>
        <Body muted style={{ textAlign: 'center' }}>
          You’ll put songs in order by section, reply Going or Can’t come, and use Rehearse and Perform on the day.
        </Body>
      </Card>
    </Page>
  );
}

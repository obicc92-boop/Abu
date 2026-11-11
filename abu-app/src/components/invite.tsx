/** The group's code, big, with WhatsApp sharing and copying. */
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { inviteLink, inviteMessage } from '@/api/client';
import { colors, fonts } from '@/theme/tokens';

import { Body, Button, Card, Kicker } from './ui';

export function InviteCard({ groupName, code, intro }: { groupName: string; code: string; intro?: string }) {
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const copy = async (what: 'code' | 'link') => {
    await Clipboard.setStringAsync(what === 'code' ? code : inviteLink(code));
    setCopied(what);
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <Card>
      <Kicker>Invite your members</Kicker>
      {intro ? <Body>{intro}</Body> : null}
      <View style={styles.codeBox} accessible accessibilityLabel={`Group code ${code.split('').join(' ')}`}>
        <Text style={styles.code}>{code}</Text>
      </View>
      <Button
        label="Share on WhatsApp"
        onPress={() => Linking.openURL(`https://wa.me/?text=${encodeURIComponent(inviteMessage(groupName, code))}`)}
        style={{ backgroundColor: '#1F8F4E' }}
      />
      <View style={styles.row}>
        <Button kind="ghost" small label={copied === 'code' ? 'Copied ✓' : 'Copy code'} onPress={() => copy('code')} style={{ flex: 1 }} />
        <Button kind="ghost" small label={copied === 'link' ? 'Copied ✓' : 'Copy invite link'} onPress={() => copy('link')} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  codeBox: { backgroundColor: colors.sand, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  code: { fontFamily: fonts.monoBold, fontSize: 34, letterSpacing: 8, color: colors.ink },
  row: { flexDirection: 'row', gap: 8 },
});

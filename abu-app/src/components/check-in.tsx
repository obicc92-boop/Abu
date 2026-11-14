/** Check yourself in with the 4-digit code your leader shows at the rehearsal. */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Text, TextInput } from 'react-native';

import { api } from '@/api/client';
import { makeStyles, useColors } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { Body, Button, Card, ErrorText, Kicker } from './ui';

export function CheckIn({ eventId }: { eventId: string }) {
  const styles = useStyles();
  const colors = useColors();
  const [code, setCode] = useState('');
  const queryClient = useQueryClient();
  const send = useMutation({
    mutationFn: () => api.checkIn(eventId, code),
    onSuccess: ({ result }) => {
      if (result !== 'present') return;
      void queryClient.invalidateQueries({ queryKey: ['event', eventId] });
      void queryClient.invalidateQueries({ queryKey: ['myAttendance'] });
    },
  });
  const result = send.data?.result;
  if (result === 'present') return <CheckedIn />;
  return (
    <Card>
      <Kicker color={colors.redDeep}>Check in</Kicker>
      <Body muted>Enter the 4-digit code your leader is showing at the rehearsal.</Body>
      <TextInput
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={4}
        placeholder="0000"
        placeholderTextColor={colors.placeholder}
        accessibilityLabel="Check-in code"
        style={styles.code}
        onSubmitEditing={() => code.length === 4 && send.mutate()}
      />
      {result === 'wrong_code' ? <ErrorText message="That code doesn’t match. Check the code your leader is showing." /> : null}
      {result === 'locked' ? <ErrorText message="Too many wrong codes. Ask your leader or part leader to mark you." /> : null}
      {send.error ? <ErrorText message={send.error.message} /> : null}
      <Button label="Check in" onPress={() => send.mutate()} disabled={code.length !== 4 || result === 'locked'} busy={send.isPending} />
    </Card>
  );
}

export function CheckedIn() {
  const styles = useStyles();
  return (
    <Card style={styles.ok}>
      <Text style={styles.okText}>✓ You’re checked in. Enjoy rehearsal!</Text>
    </Card>
  );
}

const useStyles = makeStyles((colors) => ({
  code: {
    fontFamily: fonts.monoBold,
    fontSize: 34,
    letterSpacing: 14,
    textAlign: 'center',
    color: colors.ink,
    backgroundColor: colors.sand,
    borderRadius: 12,
    paddingVertical: 12,
    outlineColor: colors.red,
  },
  ok: { backgroundColor: colors.okTint, borderColor: colors.okLine },
  okText: { fontFamily: fonts.heavy, fontSize: 15, color: colors.ok },
}));

/**
 * Which section starts at a line of music (owner's request, 21 November 2026: "chorus, verses, refrain"): none, so
 * the line carries on the section before it (said, when there's one), or one of the names (src/solfa/sections.ts).
 * A name a sheet printed that isn't among them ("Verse 2") is offered too, while the line has it. Used by the song
 * editor's open line and Check the reading.
 */
import { Text, View } from 'react-native';

import { SECTION_CHOICES } from '@/solfa';
import { makeStyles } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

import { Chip } from './ui';

export function SectionPicker({
  current,
  carriesOn,
  onPick,
}: {
  /** The section starting at the line, or null. */
  current: string | null;
  /** The section the line is in without one of its own, or null. */
  carriesOn: string | null;
  onPick(name: string | null): void;
}) {
  const styles = useStyles();
  const names: string[] = [...SECTION_CHOICES];
  if (current && !names.includes(current)) names.push(current);
  return (
    <View style={styles.picker}>
      <Text style={styles.hint}>Does a new section start at this line? Its name shows over the line in the score.</Text>
      <View style={styles.wrap}>
        <Chip label={carriesOn ? `No, it carries on ${carriesOn}` : 'No section'} on={!current} onPress={() => onPick(null)} />
        {names.map((n) => (
          <Chip key={n} label={n} on={current === n} onPress={() => onPick(n)} />
        ))}
      </View>
    </View>
  );
}

/** What a line's Section button says: its own section, the one it carries on, or just "Section". */
export function sectionLabel(current: string | null, carriesOn: string | null): string {
  return current ? `${current} starts here` : carriesOn ? `In ${carriesOn}` : 'Section';
}

const useStyles = makeStyles((colors) => ({
  picker: { gap: 8 },
  hint: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.muted },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
}));

const fs = require('fs');
let c = fs.readFileSync('src/screens/ScheduleScreen.tsx', 'utf8');

c = c.replace(
  /import \{ Ionicons \} from '@expo\/vector-icons';/g,
  "import { SymbolView } from 'expo-symbols';",
);
c = c.replace(
  /<Ionicons name="time" size=\{16\} color=\{theme.textSub\} style=\{styles.infoIcon\} \/>/g,
  '<SymbolView name="clock" size={16} tintColor={theme.textSub} style={styles.infoIcon} />',
);
c = c.replace(
  /<Ionicons name="person" size=\{16\} color=\{theme.textSub\} style=\{styles.infoIcon\} \/>/g,
  '<SymbolView name="person.fill" size={16} tintColor={theme.textSub} style={styles.infoIcon} />',
);
c = c.replace(
  /<Ionicons name="location" size=\{16\} color=\{theme.textSub\} style=\{styles.infoIcon\} \/>/g,
  '<SymbolView name="mappin.and.ellipse" size={16} tintColor={theme.textSub} style={styles.infoIcon} />',
);
c = c.replace(
  /<Ionicons name="refresh" size=\{24\} color=\{theme.primary\} \/>/g,
  '<SymbolView name="arrow.clockwise" size={24} tintColor={theme.primary} />',
);
c = c.replace(
  /<Ionicons name="information-circle" size=\{48\} color="#FF9500" \/>/g,
  '<SymbolView name="info.circle.fill" size={48} tintColor="#FF9500" />',
);
c = c.replace(
  /<Ionicons name="information-circle" size=\{18\} color="#FF9500" \/>/g,
  '<SymbolView name="info.circle.fill" size={18} tintColor="#FF9500" />',
);

fs.writeFileSync('src/screens/ScheduleScreen.tsx', c);

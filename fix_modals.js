const fs = require('fs');

const files = [
  'src/features/schedule/screens/ScheduleScreen.tsx',
  'src/features/grade/screens/GradeScreen.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Add modalTopInset
  if (!content.includes('const modalTopInset')) {
    content = content.replace(
      'const insets = useSafeAreaInsets();',
      'const insets = useSafeAreaInsets();\n  const modalTopInset = Platform.OS === \'ios\' ? 12 : Math.max(insets.top, 12);'
    );
  }

  // Replace floatingHeaderHeight
  content = content.replace(/const floatingHeaderHeight = insets\.top \+ 140;/g, 'const floatingHeaderHeight = modalTopInset + 140;');

  // Replace top for Animated.Text
  content = content.replace(/top: insets\.top \+ 12,/g, 'top: modalTopInset + 12,');

  // Replace paddingTop for ScrollView
  content = content.replace(/paddingTop: insets\.top \+ 18/g, 'paddingTop: modalTopInset + 18');

  fs.writeFileSync(file, content);
});

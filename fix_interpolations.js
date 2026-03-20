const fs = require('fs');
const files = [
  'src/features/schedule/screens/ScheduleScreen.tsx',
  'src/features/grade/screens/GradeScreen.tsx',
  'src/features/settings/screens/SettingsScreen.tsx'
];

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // Replace centerTitleOpacity
  content = content.replace(/const centerTitleOpacity = scrollY\.interpolate\(\{\s*inputRange: \[24, 72, 104\],\s*outputRange: \[0, 0\.72, 1\],\s*extrapolate: 'clamp',\s*\}\);/m, 
    `const centerTitleOpacity = scrollY.interpolate({
    inputRange: [45, 75, 95],
    outputRange: [0, 0.8, 1],
    extrapolate: 'clamp',
  });`);

  // Replace centerTitleTranslateY
  content = content.replace(/const centerTitleTranslateY = scrollY\.interpolate\(\{\s*inputRange: \[20, 100\],\s*outputRange: \[10, 0\],\s*extrapolate: 'clamp',\s*\}\);/m, 
    `const centerTitleTranslateY = scrollY.interpolate({
    inputRange: [45, 95],
    outputRange: [10, 0],
    extrapolate: 'clamp',
  });`);

  // Replace pageTitleOpacity
  content = content.replace(/const pageTitleOpacity = scrollY\.interpolate\(\{\s*inputRange: \[0, 26, 78\],\s*outputRange: \[1, 1, 0\],\s*extrapolate: 'clamp',\s*\}\);/m, 
    `const pageTitleOpacity = scrollY.interpolate({
    inputRange: [0, 15, 45],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });`);

  fs.writeFileSync(file, content);
});

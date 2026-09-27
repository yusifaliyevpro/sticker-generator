import { registerFont } from 'canvas';
import path from 'path';

// quote-api draws message text with the 'NotoSans' family
export function registerCustomFonts() {
  const fontsDir = path.join(process.cwd(), 'assets/fonts/'); // __dirname yerine process.cwd() kullanılabilir

  try {
    registerFont(`${fontsDir}/NotoSans-Bold.ttf`, { family: 'NotoSans', weight: 'bold' });
    registerFont(`${fontsDir}/NotoSans-Regular.ttf`, { family: 'NotoSans', weight: 'normal' });

    console.log('✅ Fontlar başarıyla yüklendi.');
  } catch (error) {
    console.error('❌ Font yükleme hatası:', error);
  }
}

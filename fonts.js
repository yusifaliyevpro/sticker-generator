import { registerFont } from 'canvas';
import path from 'path';

// Fontları Manuel Olarak Kaydet
export function registerCustomFonts() {
  const fontsDir = path.join(process.cwd(), 'assets/fonts/'); // __dirname yerine process.cwd() kullanılabilir

  try {
    registerFont(`${fontsDir}/NotoSans-Bold.ttf`, { family: 'Noto Sans', weight: 'bold'});
    registerFont(`${fontsDir}/NotoSans-Regular.ttf`, { family: 'Noto Sans', weight: 'normal' });

    console.log('✅ Fontlar başarıyla yüklendi.');
  } catch (error) {
    console.error('❌ Font yükleme hatası:', error);
  }
}

registerPaint(
  'glassBorder',
  class {
    static get inputProperties() {
      return ['--glass-border-radius', '--glass-border-opacity'];
    }

    paint(ctx, geom, properties) {
      const borderRadius = properties.get('--glass-border-radius');
      const opacity = properties.get('--glass-border-opacity');

      const topLeftGradient = ctx.createRadialGradient(
        0,
        0,
        0,
        0,
        0,
        Math.max(geom.width, geom.height),
      );

      topLeftGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      topLeftGradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

      const bottomRightGradient = ctx.createRadialGradient(
        geom.width,
        geom.height,
        0,
        geom.width,
        geom.height,
        Math.max(geom.width, geom.height),
      );

      bottomRightGradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
      bottomRightGradient.addColorStop(1, 'rgba(255, 255, 255, 0.0)');

      ctx.beginPath();
      ctx.roundRect(0, 0, geom.width, geom.height, [borderRadius.value]);
      ctx.globalAlpha = opacity.value / 100;

      ctx.lineWidth = 1;
      ctx.strokeStyle = topLeftGradient;
      ctx.stroke();

      ctx.lineWidth = 1;
      ctx.strokeStyle = bottomRightGradient;
      ctx.stroke();

      ctx.globalAlpha = 1;
    }
  },
);

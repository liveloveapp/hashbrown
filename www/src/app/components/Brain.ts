import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  ChangeDetectionStrategy,
  computed,
  signal,
  viewChild,
} from '@angular/core';

interface DataItem {
  x: number;
  y: number;
  neighbors: number[];
  id: number;
}

interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const RADIUS_OF_GRAVITY_WELL = 64;

function getData(): DataItem[] {
  return [
    { x: 152, y: 243, neighbors: [], id: 0 },
    { x: 128, y: 227, neighbors: [63, 0], id: 1 },
    { x: 156, y: 212, neighbors: [0], id: 2 },
    { x: 152, y: 181, neighbors: [4], id: 3 },
    { x: 179, y: 163, neighbors: [22], id: 4 },
    { x: 143, y: 164, neighbors: [7, 3], id: 5 },
    { x: 120, y: 161, neighbors: [7, 66, 11], id: 6 },
    { x: 148, y: 145, neighbors: [], id: 7 },
    { x: 181, y: 132, neighbors: [178], id: 8 },
    { x: 239, y: 133, neighbors: [], id: 9 },
    { x: 171, y: 110, neighbors: [178, 7], id: 10 },
    { x: 124, y: 120, neighbors: [12], id: 11 },
    { x: 125, y: 107, neighbors: [], id: 12 },
    { x: 91, y: 69, neighbors: [69], id: 13 },
    { x: 108, y: 47, neighbors: [70], id: 14 },
    { x: 133, y: 70, neighbors: [67, 16], id: 15 },
    { x: 136, y: 81, neighbors: [12], id: 16 },
    { x: 176, y: 61, neighbors: [21, 71], id: 17 },
    { x: 168, y: 48, neighbors: [20], id: 18 },
    { x: 149, y: 25, neighbors: [17], id: 19 },
    { x: 171, y: 20, neighbors: [], id: 20 },
    { x: 199, y: 67, neighbors: [84, 71, 16, 10], id: 21 },
    { x: 198, y: 214, neighbors: [26, 2, 105, 110, 23], id: 22 },
    { x: 200, y: 260, neighbors: [24], id: 23 },
    { x: 168, y: 259, neighbors: [], id: 24 },
    { x: 149, y: 268, neighbors: [], id: 25 },
    { x: 166, y: 226, neighbors: [24], id: 26 },
    { x: 193, y: 287, neighbors: [23, 28, 49], id: 27 },
    { x: 199, y: 299, neighbors: [], id: 28 },
    { x: 197, y: 322, neighbors: [49], id: 29 },
    { x: 200, y: 372, neighbors: [140], id: 30 },
    { x: 198, y: 396, neighbors: [30], id: 31 },
    { x: 198, y: 427, neighbors: [], id: 32 },
    { x: 174, y: 431, neighbors: [32], id: 33 },
    { x: 149, y: 434, neighbors: [], id: 34 },
    { x: 158, y: 456, neighbors: [36, 34], id: 35 },
    { x: 141, y: 448, neighbors: [], id: 36 },
    { x: 123, y: 444, neighbors: [], id: 37 },
    { x: 107, y: 433, neighbors: [177], id: 38 },
    { x: 121, y: 409, neighbors: [177, 38, 46, 47, 40], id: 39 },
    { x: 164, y: 420, neighbors: [32, 34, 31], id: 40 },
    { x: 103, y: 390, neighbors: [39], id: 41 },
    { x: 111, y: 368, neighbors: [], id: 42 },
    { x: 79, y: 348, neighbors: [55], id: 43 },
    { x: 114, y: 355, neighbors: [42, 55], id: 44 },
    { x: 126, y: 349, neighbors: [53, 50, 44], id: 45 },
    { x: 136, y: 352, neighbors: [42], id: 46 },
    { x: 188, y: 360, neighbors: [48, 140], id: 47 },
    { x: 181, y: 337, neighbors: [52, 51], id: 48 },
    { x: 174, y: 299, neighbors: [50], id: 49 },
    { x: 155, y: 299, neighbors: [51], id: 50 },
    { x: 160, y: 327, neighbors: [], id: 51 },
    { x: 164, y: 341, neighbors: [46], id: 52 },
    { x: 110, y: 308, neighbors: [54], id: 53 },
    { x: 114, y: 295, neighbors: [58, 25], id: 54 },
    { x: 88, y: 320, neighbors: [57], id: 55 },
    { x: 75, y: 324, neighbors: [], id: 56 },
    { x: 83, y: 311, neighbors: [169], id: 57 },
    { x: 111, y: 276, neighbors: [53, 61], id: 58 },
    { x: 78, y: 222, neighbors: [162], id: 59 },
    { x: 88, y: 208, neighbors: [], id: 60 },
    { x: 103, y: 239, neighbors: [59, 60], id: 61 },
    { x: 109, y: 196, neighbors: [63, 64, 6], id: 62 },
    { x: 119, y: 206, neighbors: [60], id: 63 },
    { x: 84, y: 175, neighbors: [161], id: 64 },
    { x: 78, y: 143, neighbors: [66, 68], id: 65 },
    { x: 100, y: 128, neighbors: [], id: 66 },
    { x: 90, y: 79, neighbors: [13], id: 67 },
    { x: 40, y: 155, neighbors: [160], id: 68 },
    { x: 74, y: 68, neighbors: [70], id: 69 },
    { x: 98, y: 48, neighbors: [], id: 70 },
    { x: 199, y: 37, neighbors: [], id: 71 },
    { x: 230, y: 21, neighbors: [71], id: 72 },
    { x: 253, y: 21, neighbors: [75], id: 73 },
    { x: 245, y: 55, neighbors: [75, 84, 85], id: 74 },
    { x: 250, y: 42, neighbors: [], id: 75 },
    { x: 274, y: 65, neighbors: [82], id: 76 },
    { x: 285, y: 39, neighbors: [81, 76], id: 77 },
    { x: 307, y: 51, neighbors: [81], id: 78 },
    { x: 331, y: 78, neighbors: [80, 83, 90], id: 79 },
    { x: 315, y: 72, neighbors: [83, 82], id: 80 },
    { x: 290, y: 66, neighbors: [82], id: 81 },
    { x: 297, y: 79, neighbors: [], id: 82 },
    { x: 309, y: 83, neighbors: [], id: 83 },
    { x: 225, y: 66, neighbors: [], id: 84 },
    { x: 262, y: 77, neighbors: [], id: 85 },
    { x: 253, y: 99, neighbors: [88, 85], id: 86 },
    { x: 231, y: 106, neighbors: [84], id: 87 },
    { x: 274, y: 116, neighbors: [], id: 88 },
    { x: 295, y: 101, neighbors: [90, 82, 83], id: 89 },
    { x: 315, y: 102, neighbors: [], id: 90 },
    { x: 348, y: 139, neighbors: [93], id: 91 },
    { x: 302, y: 135, neighbors: [88, 90, 93, 104], id: 92 },
    { x: 331, y: 144, neighbors: [], id: 93 },
    { x: 346, y: 160, neighbors: [], id: 94 },
    { x: 321, y: 174, neighbors: [94, 104, 102, 114], id: 95 },
    { x: 370, y: 195, neighbors: [100], id: 96 },
    { x: 380, y: 191, neighbors: [117, 96], id: 97 },
    { x: 337, y: 181, neighbors: [94, 96, 99], id: 98 },
    { x: 332, y: 201, neighbors: [114], id: 99 },
    { x: 344, y: 211, neighbors: [115], id: 100 },
    { x: 283, y: 214, neighbors: [102, 109], id: 101 },
    { x: 275, y: 199, neighbors: [], id: 102 },
    { x: 259, y: 166, neighbors: [106, 104], id: 103 },
    { x: 278, y: 157, neighbors: [106], id: 104 },
    { x: 221, y: 170, neighbors: [103, 9], id: 105 },
    { x: 259, y: 147, neighbors: [], id: 106 },
    { x: 294, y: 244, neighbors: [109], id: 107 },
    { x: 252, y: 215, neighbors: [109, 110], id: 108 },
    { x: 270, y: 227, neighbors: [], id: 109 },
    { x: 232, y: 229, neighbors: [112], id: 110 },
    { x: 246, y: 244, neighbors: [112], id: 111 },
    { x: 231, y: 252, neighbors: [], id: 112 },
    { x: 249, y: 272, neighbors: [112, 123, 128], id: 113 },
    { x: 310, y: 211, neighbors: [115], id: 114 },
    { x: 323, y: 228, neighbors: [119], id: 115 },
    { x: 357, y: 233, neighbors: [100, 119], id: 116 },
    { x: 375, y: 209, neighbors: [], id: 117 },
    { x: 384, y: 269, neighbors: [116], id: 118 },
    { x: 336, y: 245, neighbors: [], id: 119 },
    { x: 355, y: 275, neighbors: [122, 119], id: 120 },
    { x: 312, y: 272, neighbors: [123, 107], id: 121 },
    { x: 324, y: 288, neighbors: [], id: 122 },
    { x: 299, y: 276, neighbors: [125, 122], id: 123 },
    { x: 313, y: 308, neighbors: [], id: 124 },
    { x: 291, y: 301, neighbors: [], id: 125 },
    { x: 266, y: 310, neighbors: [132, 125], id: 126 },
    { x: 240, y: 302, neighbors: [128, 126], id: 127 },
    { x: 228, y: 297, neighbors: [28], id: 128 },
    { x: 252, y: 318, neighbors: [130], id: 129 },
    { x: 237, y: 330, neighbors: [139], id: 130 },
    { x: 235, y: 346, neighbors: [139, 140], id: 131 },
    { x: 288, y: 313, neighbors: [133, 137], id: 132 },
    { x: 313, y: 326, neighbors: [143], id: 133 },
    { x: 338, y: 311, neighbors: [124], id: 134 },
    { x: 379, y: 339, neighbors: [134], id: 135 },
    { x: 341, y: 322, neighbors: [133, 124], id: 136 },
    { x: 284, y: 357, neighbors: [141, 138], id: 137 },
    { x: 268, y: 352, neighbors: [139, 141], id: 138 },
    { x: 256, y: 350, neighbors: [], id: 139 },
    { x: 213, y: 360, neighbors: [], id: 140 },
    { x: 284, y: 370, neighbors: [149], id: 141 },
    { x: 311, y: 364, neighbors: [149], id: 142 },
    { x: 317, y: 351, neighbors: [142], id: 143 },
    { x: 332, y: 380, neighbors: [], id: 144 },
    { x: 364, y: 366, neighbors: [144, 143], id: 145 },
    { x: 343, y: 385, neighbors: [145], id: 146 },
    { x: 319, y: 397, neighbors: [149], id: 147 },
    { x: 304, y: 412, neighbors: [150], id: 148 },
    { x: 297, y: 384, neighbors: [], id: 149 },
    { x: 284, y: 411, neighbors: [154], id: 150 },
    { x: 231, y: 424, neighbors: [152, 32, 31, 131, 141, 150], id: 151 },
    { x: 219, y: 434, neighbors: [157], id: 152 },
    { x: 249, y: 436, neighbors: [], id: 153 },
    { x: 274, y: 426, neighbors: [], id: 154 },
    { x: 287, y: 437, neighbors: [159], id: 155 },
    { x: 256, y: 449, neighbors: [154], id: 156 },
    { x: 222, y: 463, neighbors: [158], id: 157 },
    { x: 245, y: 468, neighbors: [153], id: 158 },
    { x: 306, y: 439, neighbors: [154], id: 159 },
    { x: 24, y: 185, neighbors: [], id: 160 },
    { x: 69, y: 199, neighbors: [162], id: 161 },
    { x: 57, y: 211, neighbors: [], id: 162 },
    { x: 35, y: 200, neighbors: [162, 164], id: 163 },
    { x: 46, y: 224, neighbors: [], id: 164 },
    { x: 27, y: 251, neighbors: [166, 164], id: 165 },
    { x: 20, y: 266, neighbors: [167, 168], id: 166 },
    { x: 46, y: 272, neighbors: [], id: 167 },
    { x: 60, y: 242, neighbors: [59, 162], id: 168 },
    { x: 60, y: 307, neighbors: [], id: 169 },
    { x: 23, y: 338, neighbors: [169, 56], id: 170 },
    { x: 39, y: 362, neighbors: [172], id: 171 },
    { x: 66, y: 373, neighbors: [173, 41], id: 172 },
    { x: 54, y: 393, neighbors: [174], id: 173 },
    { x: 55, y: 420, neighbors: [172, 175], id: 174 },
    { x: 97, y: 447, neighbors: [37, 177], id: 175 },
    { x: 148, y: 471, neighbors: [36, 37], id: 176 },
    { x: 124, y: 430, neighbors: [], id: 177 },
    { x: 201, y: 135, neighbors: [9], id: 178 },
  ];
}

@Component({
  selector: 'www-brain',
  template: `
    <svg width="404" height="491" viewBox="0 0 404 491" #svgRef>
      <g id="brain">
        @for (line of lines(); track $index) {
          <line
            [attr.x1]="line.x1"
            [attr.y1]="line.y1"
            [attr.x2]="line.x2"
            [attr.y2]="line.y2"
            strokeWidth="1"
            class="line"
          />
        }
        @for (item of circles(); track $index) {
          <circle [attr.cx]="item.x" [attr.cy]="item.y" r="4" class="node" />
        }
      </g>
    </svg>
  `,
  styles: `
    :host {
      display: block;
    }

    .line {
      stroke: #2f2f2b;
    }

    .node {
      fill: #2f2f2b;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrainComponent {
  svgRef = viewChild.required('svgRef', { read: ElementRef<SVGElement> });
  mousePosition = signal<{ x: number; y: number } | null>(null);
  data = signal<DataItem[]>(getData());

  circles = computed((): DataItem[] => {
    const mouse = this.mousePosition();
    const items = this.data();
    if (!mouse) return items;
    return items.map((item) => {
      const dx = mouse.x - item.x;
      const dy = mouse.y - item.y;
      const dist = Math.hypot(dx, dy);
      if (dist >= RADIUS_OF_GRAVITY_WELL) return item;
      const factor = 1 - dist / RADIUS_OF_GRAVITY_WELL;
      return {
        ...item,
        x: item.x + dx * factor,
        y: item.y + dy * factor,
      };
    });
  });

  lines = computed((): Line[] =>
    this.circles().flatMap((item) =>
      item.neighbors.map((n) => ({
        x1: item.x,
        y1: item.y,
        x2: this.circles()[n].x,
        y2: this.circles()[n].y,
      })),
    ),
  );

  @HostListener('document:mousemove', ['$event'])
  handleMouseMove(e: MouseEvent) {
    const rect = this.svgRef().nativeElement.getBoundingClientRect();
    this.mousePosition.set({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  }
}

import type { jsPDF } from "jspdf";

declare module "jspdf-autotable" {
  interface UserOptions {
    startY?: number;
    head?: string[][];
    body?: (string | number)[][];
  }

  export default function autoTable(doc: jsPDF, options: UserOptions): void;
}

declare module "jspdf" {
  interface jsPDF {
    lastAutoTable?: { finalY: number };
  }
}

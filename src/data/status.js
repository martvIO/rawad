import { C } from "../styles/theme.js";
// Delivery-status presentation map: label, colours and icon for each guest status.
export const STATUS = {
  pending:   { label:"لم يبدأ",    color:C.dim, bg:"rgba(122,106,74,.15)",  icon:"⌛" },
  enroute:   { label:"في الطريق",  color:C.blue, bg:"rgba(75,159,212,.15)",  icon:"🚗" },
  delivered: { label:"تم التسليم", color:"#4cc97a", bg:"rgba(76,201,122,.15)",  icon:"✓" },
};

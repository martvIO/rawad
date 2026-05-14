// Delivery-status presentation map: label, colours and icon for each guest status.
export const STATUS = {
  pending:   { label:"لم يبدأ",    color:"#7a6a4a", bg:"rgba(122,106,74,.15)",  icon:"⌛" },
  enroute:   { label:"في الطريق",  color:"#4b9fd4", bg:"rgba(75,159,212,.15)",  icon:"🚗" },
  delivered: { label:"تم التسليم", color:"#4cc97a", bg:"rgba(76,201,122,.15)",  icon:"✓" },
};

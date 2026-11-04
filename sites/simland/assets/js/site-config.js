// Contact details of «با ما در ارتباط باشید» — the one place to edit them.
// The page is built from these values (node tools/build-pages.mjs):
//
//   groups   one card per group, in this order. `numbers` are digits only, as
//            they are dialled (e.g. '09121234567'); each becomes its own tel: link
//            and is shown in readable groups (0912 123 4567, 025 3355 1111).
//            One number: the whole card is the call link. Several: one row each.
//            None: the card says «شماره تماس به‌زودی» and has no link.
//   address  the branch address as text. `mapUrl`: a verified map / route link;
//            while it is empty the card offers «کپی آدرس» instead of a map link.
export const contact = {
  groups: [
    { label: 'مشاوره و خرید', tone: 'blue', numbers: ['09123520415', '09127473187'] },
    { label: 'دفتر مرکزی', tone: 'green', numbers: ['02533551111'] },
  ],
  address: { label: 'آدرس شعبه مرکزی', text: 'قم، خیابان مفتح، نبش کوچه ۶', mapUrl: '' },
};

const itemHeight = 56 * 2;

const ICON_MAP = {
  app: '/assets/icons/folder.svg',
  'view-module': '/assets/icons/grid.svg',
  image: '/assets/icons/image.svg',
  bulletpoint: '/assets/icons/list.svg',
  chat: '/assets/icons/chat.svg',
};

Component({
  data: {
    childBoxHeight: 0,
    iconSrc: '/assets/icons/folder.svg',
    rightIconSrc: '/assets/icons/chevron-right.svg',
  },
  externalClasses: ['t-class'],
  properties: {
    defaultOpen: {
      type: Boolean,
      value: false,
    },
    name: {
      type: String,
      value: '',
    },
    icon: {
      type: String,
      value: '',
      observer(icon) {
        this.setData({
          iconSrc: ICON_MAP[icon] || '/assets/icons/folder.svg',
        });
      },
    },
    childArr: {
      type: Array,
      value: [],
      observer(childArr) {
        this.setData({
          childBoxHeight: this.data.defaultOpen ? itemHeight * childArr.length : 0,
        });
      },
    },
  },
  methods: {
    switchHandle() {
      const { childArr, childBoxHeight } = this.data;
      this.setData({
        childBoxHeight: childBoxHeight > 0 ? 0 : childArr.length * itemHeight,
      });
    },
    tapChild(e) {
      this.triggerEvent('click', e.target.dataset);
    },
  },
});

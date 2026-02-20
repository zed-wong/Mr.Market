export type SidebarMenuChild = {
  key: string;
  labelKey: string;
  value: string;
};

export type SidebarMenuItem = {
  key: string;
  labelKey: string;
  value: string;
  icon: string;
  children?: SidebarMenuChild[];
};

export const buildAdminSidebarMenu = (): SidebarMenuItem[] => {
  return [
    {
      key: "dashboard",
      labelKey: "dashboard",
      value: "/manage",
      icon: "dashboard",
    },
    {
      key: "settings",
      labelKey: "settings",
      value: "/manage/settings",
      icon: "settings",
      children: [
        {
          key: "exchanges",
          labelKey: "exchanges",
          value: "/manage/settings/exchanges",
        },
        {
          key: "spot-trading",
          labelKey: "spot_trading",
          value: "/manage/settings/spot-trading",
        },
        {
          key: "market-making",
          labelKey: "market_making",
          value: "/manage/settings/market-making",
        },
        {
          key: "fees",
          labelKey: "fees",
          value: "/manage/settings/fees",
        },
        {
          key: "api-keys",
          labelKey: "api_keys",
          value: "/manage/settings/api-keys",
        },
      ],
    },
  ];
};

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
      key: "settings",
      labelKey: "settings",
      value: "/settings",
      icon: "settings",
      children: [
        {
          key: "exchanges",
          labelKey: "exchanges",
          value: "/settings/exchanges",
        },
        {
          key: "spot-trading",
          labelKey: "spot_trading",
          value: "/settings/spot-trading",
        },
        {
          key: "market-making",
          labelKey: "market_making",
          value: "/settings/market-making",
        },
        {
          key: "fees",
          labelKey: "fees",
          value: "/settings/fees",
        },
        {
          key: "api-keys",
          labelKey: "api_keys",
          value: "/settings/api-keys",
        },
        {
          key: "strategies",
          labelKey: "strategies",
          value: "/settings/strategies",
        },
        {
          key: "direct-market-making",
          labelKey: "admin_direct_mm_nav",
          value: "/market-making/direct",
        },
      ],
    },
  ];
};

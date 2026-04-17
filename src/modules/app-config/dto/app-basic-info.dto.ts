export class AppBasicInfoQueryDto {
  phone_version!: string;
}

export class AppBasicInfoResponseDto {
  maintenance!: {
    is_under_maintenance: number;
    image: string | null;
    msg: string;
  };
  update_checker!: {
    is_update_required: number;
    image: string;
    msg: string;
  };
  campaign!: {
    is_campaign_running: number;
    image: string | null;
    msg: string;
  };
}

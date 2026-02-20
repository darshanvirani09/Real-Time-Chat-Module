import { Model } from '@nozbe/watermelondb'
import { field, date } from '@nozbe/watermelondb/decorators'

export default class AppSettings extends Model {
  static table = 'app_settings'

  @field('self_id') selfId!: string | null
  @field('self_name') selfName!: string | null
  @field('self_mobile') selfMobile!: string | null
  @field('socket_url') socketUrl!: string | null
  @date('updated_at') updatedAt!: number | Date
}
